import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import Vehicle from '../models/vehicle.model.js';
import { timeOperation } from '../utils/performance.utils.js';
import { isCustomerRole } from '../constants/roles.js';
import {
  allocateAmountToServices,
  buildLedgerTransaction,
  getMethodAllocations,
  getOrderServiceTotal,
  getPaymentEffectiveAt,
  getPaymentSubmittedAt,
  getServiceLines,
  getSignedAmount,
  getSubmittedAmount,
  getVerifiedAmount,
  isPostedPayment,
  isRefundPayment,
  roundMoney,
  summarizeLedgerRows,
} from './financialLedger.service.js';
import {
  REPORT_TIME_ZONE,
  formatManilaYmd,
  isWithinRange,
  parseReportingRange,
} from '../utils/reportingRange.utils.js';

export const LEGITIMATE_BOOKING_STATUSES = Object.freeze(new Set([
  'approved',
  'confirmed',
  'assigned',
  'queued',
  'received',
  'in_progress',
  'ready_for_payment',
  'completed',
  'paid',
  'released',
]));

const ACTIVE_JOURNEY_STATUSES = new Set([
  'approved', 'confirmed', 'assigned', 'queued', 'received', 'in_progress', 'ready_for_payment',
]);
const COMPLETED_SERVICE_STATUSES = new Set(['completed', 'paid', 'released']);

const asPlain = (value) => value?.toObject ? value.toObject() : value;
const idOf = (value) => value ? String(value?._id || value) : null;
const normalizedStatus = (value) => String(value || '').toLowerCase().replace(/-/g, '_');

export const isLegitimateBooking = (order) => (
  Boolean(order?.approvedAt)
  && LEGITIMATE_BOOKING_STATUSES.has(normalizedStatus(order?.status))
);

export const getVisitEvidenceAt = (order) => {
  const candidates = [
    order?.arrivedAt,
    order?.egressData?.releaseTimestamp,
    order?.egressData?.completedAt,
    order?.serviceProper?.completedAt,
    order?.qcCompletedAt,
    order?.jobOrder?.ingressDateTime,
  ].filter(Boolean).map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime()));
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map(Number)));
};

const pctChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return roundMoney(((current - previous) / Math.abs(previous)) * 100);
};

const metricComparison = (value, previousValue) => ({
  value: roundMoney(value),
  previousValue: roundMoney(previousValue),
  percentChange: pctChange(value, previousValue),
});

const customerIdentity = (order) => idOf(order?.customer) || `order:${idOf(order)}`;

const computeCore = ({ orders, payments, start, end }) => {
  const bookings = orders.filter((order) => isLegitimateBooking(order) && isWithinRange(order.approvedAt, start, end));
  const posted = payments.filter((payment) => isPostedPayment(payment) && isWithinRange(getPaymentEffectiveAt(payment), start, end));
  const pending = payments.filter((payment) => payment.status === 'pending' && isWithinRange(getPaymentSubmittedAt(payment), start, end));
  const bookedSalesValue = bookings.reduce((sum, order) => sum + getOrderServiceTotal(order), 0);
  const confirmedOrders = bookings.length;
  return {
    bookings,
    posted,
    pending,
    netCollectedRevenue: roundMoney(posted.reduce((sum, payment) => sum + getSignedAmount(payment), 0)),
    bookedSalesValue: roundMoney(bookedSalesValue),
    confirmedOrders,
    averageOrderValue: roundMoney(confirmedOrders ? bookedSalesValue / confirmedOrders : 0),
    uniqueCustomers: new Set(bookings.map(customerIdentity)).size,
    pendingVerification: roundMoney(pending.reduce((sum, payment) => sum + getSubmittedAmount(payment), 0)),
  };
};

const buildRevenueTrend = (posted, range) => {
  if (!posted.length) return [];
  const sortedDates = posted.map(getPaymentEffectiveAt).filter(Boolean).map((value) => new Date(value)).sort((a, b) => a - b);
  const effectiveStart = range.start || sortedDates[0];
  const effectiveEnd = range.end || sortedDates[sortedDates.length - 1];
  const daySpan = Math.max(1, Math.ceil((effectiveEnd - effectiveStart) / 86_400_000));
  const monthly = !range.start || daySpan > 120;
  const buckets = new Map();
  posted.forEach((payment) => {
    const ymd = formatManilaYmd(getPaymentEffectiveAt(payment));
    const key = monthly ? ymd.slice(0, 7) : ymd;
    const current = buckets.get(key) || { date: key, netCollected: 0, payments: 0, refunds: 0 };
    const signed = getSignedAmount(payment);
    current.netCollected = roundMoney(current.netCollected + signed);
    if (signed < 0) current.refunds = roundMoney(current.refunds + Math.abs(signed));
    else current.payments += 1;
    buckets.set(key, current);
  });
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const buildServiceMetrics = ({ bookings, posted, orderMap, serviceMetric }) => {
  const metrics = new Map();
  const ensure = (name) => {
    const key = name || 'Unassigned';
    if (!metrics.has(key)) metrics.set(key, { name: key, confirmedOrders: 0, bookedValue: 0, collected: 0 });
    return metrics.get(key);
  };

  bookings.forEach((order) => {
    const lines = getServiceLines(order);
    const uniqueNames = new Set();
    lines.forEach((line) => {
      const metric = ensure(line.name);
      metric.bookedValue = roundMoney(metric.bookedValue + line.value);
      uniqueNames.add(line.name);
    });
    uniqueNames.forEach((name) => { ensure(name).confirmedOrders += 1; });
  });

  posted.forEach((payment) => {
    const order = orderMap.get(idOf(payment.order));
    allocateAmountToServices(getSignedAmount(payment), order, payment).forEach((allocation) => {
      const metric = ensure(allocation.name);
      metric.collected = roundMoney(metric.collected + allocation.amount);
    });
  });

  const topServices = [...metrics.values()].sort((a, b) => (
    b.bookedValue - a.bookedValue || b.collected - a.collected || b.confirmedOrders - a.confirmedOrders
  ));
  const mixTotal = topServices.reduce((sum, item) => sum + (
    serviceMetric === 'booked_value' ? item.bookedValue : item.confirmedOrders
  ), 0);
  const serviceMix = topServices.map((item) => {
    const value = serviceMetric === 'booked_value' ? item.bookedValue : item.confirmedOrders;
    return { ...item, value, percentage: mixTotal ? roundMoney((value / mixTotal) * 100) : 0 };
  }).filter((item) => item.value > 0);
  return { serviceMix, topServices: topServices.slice(0, 10) };
};

const buildPaymentMethods = (posted) => {
  const methods = new Map();
  posted.forEach((payment) => {
    const signed = getSignedAmount(payment);
    getMethodAllocations(payment).forEach((part) => {
      const method = String(part.method || 'other').toLowerCase();
      const row = methods.get(method) || { method, amount: 0, verifiedTransactions: 0, refunds: 0 };
      row.amount = roundMoney(row.amount + part.amount);
      if (signed < 0) row.refunds += 1;
      else row.verifiedTransactions += 1;
      methods.set(method, row);
    });
  });
  const net = [...methods.values()].reduce((sum, item) => sum + item.amount, 0);
  return [...methods.values()]
    .map((item) => ({ ...item, percentage: net ? roundMoney((item.amount / net) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
};

export const buildSalesReportFromRecords = ({ orders: rawOrders, payments: rawPayments, range, serviceMetric = 'orders' }) => {
  const orders = rawOrders.map(asPlain);
  const payments = rawPayments.map(asPlain);
  const orderMap = new Map(orders.map((order) => [idOf(order), order]));
  const paymentsByOrder = new Map();
  payments.forEach((payment) => {
    const orderId = idOf(payment.order);
    if (!paymentsByOrder.has(orderId)) paymentsByOrder.set(orderId, []);
    paymentsByOrder.get(orderId).push(payment);
  });

  const current = computeCore({ orders, payments, start: range.start, end: range.end });
  const previous = range.comparison
    ? computeCore({ orders, payments, start: range.previousStart, end: range.previousEnd })
    : null;
  const outstandingBalance = current.bookings.reduce((sum, order) => {
    const snapshot = summarizeLedgerRows(paymentsByOrder.get(idOf(order)) || [], getOrderServiceTotal(order));
    return sum + snapshot.outstandingBalance;
  }, 0);
  const reservationFees = current.posted
    .filter((payment) => payment.transactionType === 'reservation_fee' && getSignedAmount(payment) > 0)
    .reduce((sum, payment) => sum + getSignedAmount(payment), 0);
  const refunds = current.posted
    .filter(isRefundPayment)
    .reduce((sum, payment) => sum + Math.abs(getSignedAmount(payment)), 0);
  const cancellations = orders.filter((order) => normalizedStatus(order.status) === 'cancelled' && isWithinRange(order.cancelledAt, range.start, range.end));
  const { serviceMix, topServices } = buildServiceMetrics({
    bookings: current.bookings,
    posted: current.posted,
    orderMap,
    serviceMetric,
  });

  const comparison = previous ? {
    netCollectedRevenue: metricComparison(current.netCollectedRevenue, previous.netCollectedRevenue),
    bookedSalesValue: metricComparison(current.bookedSalesValue, previous.bookedSalesValue),
    confirmedOrders: metricComparison(current.confirmedOrders, previous.confirmedOrders),
    averageOrderValue: metricComparison(current.averageOrderValue, previous.averageOrderValue),
    uniqueCustomers: metricComparison(current.uniqueCustomers, previous.uniqueCustomers),
  } : null;

  return {
    range: {
      key: range.key,
      from: range.from,
      to: range.to,
      start: range.start?.toISOString?.() || null,
      end: range.end?.toISOString?.() || null,
      timeZone: REPORT_TIME_ZONE,
      comparison: range.comparison ? {
        start: range.previousStart.toISOString(),
        end: range.previousEnd.toISOString(),
      } : null,
    },
    serviceMetric,
    kpis: {
      netCollectedRevenue: current.netCollectedRevenue,
      bookedSalesValue: current.bookedSalesValue,
      confirmedOrders: current.confirmedOrders,
      averageOrderValue: current.averageOrderValue,
      uniqueCustomers: current.uniqueCustomers,
    },
    comparison,
    secondary: {
      pendingVerification: current.pendingVerification,
      pendingVerificationCount: current.pending.length,
      reservationFeesCollected: roundMoney(reservationFees),
      refunds: roundMoney(refunds),
      refundCount: current.posted.filter(isRefundPayment).length,
      cancellations: cancellations.length,
      outstandingBalance: roundMoney(outstandingBalance),
    },
    revenueTrend: buildRevenueTrend(current.posted, range),
    serviceMix,
    paymentMethods: buildPaymentMethods(current.posted),
    topServices,
    reconciliation: {
      netLedgerSum: current.netCollectedRevenue,
      methodLedgerSum: roundMoney(buildPaymentMethods(current.posted).reduce((sum, row) => sum + row.amount, 0)),
    },
    _rows: { bookings: current.bookings, posted: current.posted, pending: current.pending, orderMap, paymentsByOrder },
  };
};

const escapeCsv = (value) => {
  const string = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
};

export const salesReportToCsv = (report) => {
  const header = [
    'Row Type', 'Booking ID', 'Transaction ID', 'Customer', 'Service', 'Booked Value',
    'Amount Submitted', 'Amount Verified', 'Signed Amount', 'Payment Method', 'Payment Status',
    'Booking Status', 'Submitted At', 'Effective At', 'Approved At', 'Outstanding Balance',
  ];
  const rows = [];
  report._rows.bookings.forEach((order) => {
    const orderPayments = report._rows.paymentsByOrder.get(idOf(order)) || [];
    const serviceTotal = getOrderServiceTotal(order);
    const balance = summarizeLedgerRows(orderPayments, serviceTotal).outstandingBalance;
    rows.push([
      'Booking', order.bookingReference || order.orderNumber || idOf(order), '', order.customerName || order.customer?.name || '',
      getServiceLines(order).map((line) => line.name).join(' | '), serviceTotal, '', '', '', '', '', order.status,
      '', '', order.approvedAt ? new Date(order.approvedAt).toISOString() : '', balance,
    ]);
  });
  [...report._rows.posted, ...report._rows.pending].forEach((payment) => {
    const order = report._rows.orderMap.get(idOf(payment.order)) || payment.order || {};
    const dto = buildLedgerTransaction(payment, {
      order,
      orderPayments: report._rows.paymentsByOrder.get(idOf(order)) || [],
    });
    rows.push([
      'Payment', dto.bookingId, dto.transactionId, dto.customerName, dto.services.map((line) => line.name).join(' | '),
      '', dto.amountSubmitted, dto.amountVerified, dto.signedAmount, dto.method, dto.paymentStatus, dto.bookingStatus,
      dto.submittedAt ? new Date(dto.submittedAt).toISOString() : '',
      dto.effectiveAt ? new Date(dto.effectiveAt).toISOString() : '', '', dto.outstandingBalance,
    ]);
  });
  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
};

// Keep report/CSV financial inputs explicit: orders and payments can contain
// multi-megabyte tracker photos, proof images, and proof history.
export const SALES_REPORT_ORDER_FIELDS =
  '_id orderNumber bookingReference customer customerName customerPhone serviceType status approvedAt cancelledAt ' +
  'vehicle vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate serviceId serviceTotal totalPrice totalAmount ' +
  'items subtotal discountAmount taxVatAmount additionalFees archived';
export const SALES_REPORT_PAYMENT_FIELDS =
  '_id invoiceId order customer vehicle service transactionType status amount amountSubmitted amountVerified amountPaid ' +
  'method splitPayments submittedAt effectiveAt reviewedAt paidAt createdAt updatedAt relatedPayment refundReason ' +
  'reviewReason reviewedBy staffAssigned items grandTotal subtotal discountAmount taxVatAmount additionalFees';

export const loadSalesReport = async (query = {}, timing = {}) => {
  const report = await loadSalesReportWithRows(query, timing);
  delete report._rows;
  return report;
};

export const loadSalesReportWithRows = async (query = {}, timing = {}) => {
  const range = parseReportingRange(query);
  const serviceMetric = String(query.serviceMetric || 'orders').toLowerCase();
  if (!['orders', 'booked_value'].includes(serviceMetric)) {
    const error = new Error('serviceMetric must be orders or booked_value.');
    error.statusCode = 400;
    throw error;
  }
  const [orderDocs, paymentDocs] = await Promise.all([
    timeOperation({ ...timing, kind: 'db', name: 'salesReport.orders' }, () => Order.find()
      .select(SALES_REPORT_ORDER_FIELDS)
      .populate('customer', 'name email phone phoneNumber contactNumber mobileNumber role isDeleted')
      .populate('vehicle', 'year make model color plateNumber vehicleType')
      .populate('serviceId', 'name price')),
    timeOperation({ ...timing, kind: 'db', name: 'salesReport.payments' }, () => Payment.find()
      .select(SALES_REPORT_PAYMENT_FIELDS)
      .populate('customer', 'name email phone phoneNumber contactNumber mobileNumber role isDeleted')
      .populate('order', SALES_REPORT_ORDER_FIELDS)
      .populate('vehicle', 'year make model color plateNumber vehicleType')
      .populate('service', 'name price')),
  ]);
  return timeOperation({ ...timing, kind: 'cpu', name: 'salesReport.aggregate' }, () =>
    buildSalesReportFromRecords({ orders: orderDocs, payments: paymentDocs, range, serviceMetric }));
};

const encodeCustomerKey = (kind, id) => `${kind}.${Buffer.from(String(id)).toString('base64url')}`;

const makeHistoricalIdentity = (order, userMap) => {
  const customerId = idOf(order.customer);
  const linkedUser = customerId ? userMap.get(customerId) : null;
  if (customerId && (!linkedUser || (isCustomerRole(linkedUser.role) && (linkedUser.isDeleted || linkedUser.archivedAt)))) {
    return { key: encodeCustomerKey('hist', customerId), sourceId: customerId };
  }
  return { key: encodeCustomerKey('hist', idOf(order)), sourceId: idOf(order) };
};

const makeCustomerShell = ({ key, recordType, user = null, order = null }) => ({
  customerKey: key,
  recordType,
  accountId: user ? idOf(user) : null,
  name: user?.name || order?.customerName || 'Historical customer',
  email: user?.email || '',
  phone: user?.phone || user?.phoneNumber || user?.contactNumber || user?.mobileNumber || order?.customerPhone || '',
  memberSince: user?.createdAt || order?.approvedAt || null,
  vehicles: [],
  confirmedOrders: 0,
  completedServices: 0,
  cancelledBookings: 0,
  totalSpent: 0,
  refunds: 0,
  outstandingBalance: 0,
  lastVisit: null,
  status: 'inactive',
  returning: false,
  hasVerifiedPayment: false,
  periodConfirmedOrders: 0,
  periodSpend: 0,
  periodActivity: 0,
  _orders: [],
  _payments: [],
});

const addVehicle = (customer, vehicle) => {
  if (!vehicle) return;
  const plate = String(vehicle.plateNumber || vehicle.vehiclePlate || '').trim();
  const info = [vehicle.year || vehicle.vehicleYear, vehicle.make || vehicle.vehicleMake, vehicle.model || vehicle.vehicleModel].filter(Boolean).join(' ');
  const key = `${plate}|${info}`;
  if (customer.vehicles.some((row) => row._key === key)) return;
  customer.vehicles.push({
    _key: key,
    id: idOf(vehicle),
    plate,
    year: vehicle.year || vehicle.vehicleYear || '',
    make: vehicle.make || vehicle.vehicleMake || '',
    model: vehicle.model || vehicle.vehicleModel || '',
    color: vehicle.color || vehicle.vehicleColor || '',
    vehicleType: vehicle.vehicleType || '',
    serviceHistory: [],
  });
};

export const buildCustomerRegistryFromRecords = ({
  users: rawUsers,
  vehicles: rawVehicles,
  orders: rawOrders,
  payments: rawPayments,
  activityRange,
}) => {
  const users = rawUsers.map(asPlain);
  const vehicles = rawVehicles.map(asPlain);
  const orders = rawOrders.map(asPlain);
  const payments = rawPayments.map(asPlain);
  const userMap = new Map(users.map((user) => [idOf(user), user]));
  const orderMap = new Map(orders.map((order) => [idOf(order), order]));
  const registry = new Map();
  const orderIdentity = new Map();

  users.filter((user) => isCustomerRole(user.role) && !user.isDeleted && !user.archivedAt).forEach((user) => {
    const key = encodeCustomerKey('acct', idOf(user));
    registry.set(key, makeCustomerShell({ key, recordType: 'account', user }));
  });

  orders.forEach((order) => {
    const customerId = idOf(order.customer);
    const activeAccountKey = customerId ? encodeCustomerKey('acct', customerId) : null;
    const identity = activeAccountKey && registry.has(activeAccountKey)
      ? { key: activeAccountKey, sourceId: customerId }
      : makeHistoricalIdentity(order, userMap);
    if (!registry.has(identity.key)) registry.set(identity.key, makeCustomerShell({ key: identity.key, recordType: 'historical', order }));
    orderIdentity.set(idOf(order), identity.key);
    const customer = registry.get(identity.key);
    customer._orders.push(order);
    addVehicle(customer, order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {
      plateNumber: order.vehiclePlate,
      year: order.vehicleYear,
      make: order.vehicleMake,
      model: order.vehicleModel,
      color: order.vehicleColor,
    });
  });

  vehicles.forEach((vehicle) => {
    const key = encodeCustomerKey('acct', idOf(vehicle.customer));
    if (registry.has(key)) addVehicle(registry.get(key), vehicle);
  });

  payments.forEach((payment) => {
    const orderId = idOf(payment.order);
    const key = orderIdentity.get(orderId) || (payment.customer ? encodeCustomerKey('acct', idOf(payment.customer)) : null);
    if (!key || !registry.has(key)) return;
    registry.get(key)._payments.push(payment);
  });

  registry.forEach((customer) => {
    const paymentsByOrder = new Map();
    customer._payments.forEach((payment) => {
      const orderId = idOf(payment.order);
      if (!paymentsByOrder.has(orderId)) paymentsByOrder.set(orderId, []);
      paymentsByOrder.get(orderId).push(payment);
      const signed = getSignedAmount(payment);
      customer.totalSpent = roundMoney(customer.totalSpent + signed);
      if (!isRefundPayment(payment) && isPostedPayment(payment)) customer.hasVerifiedPayment = true;
      if (isRefundPayment(payment) && isPostedPayment(payment)) customer.refunds = roundMoney(customer.refunds + Math.abs(signed));
      if (isPostedPayment(payment) && isWithinRange(getPaymentEffectiveAt(payment), activityRange.start, activityRange.end)) {
        customer.periodSpend = roundMoney(customer.periodSpend + signed);
      }
    });

    customer._orders.forEach((order) => {
      if (isLegitimateBooking(order)) {
        customer.confirmedOrders += 1;
        if (isWithinRange(order.approvedAt, activityRange.start, activityRange.end)) customer.periodConfirmedOrders += 1;
        customer.outstandingBalance = roundMoney(customer.outstandingBalance + summarizeLedgerRows(
          paymentsByOrder.get(idOf(order)) || [],
          getOrderServiceTotal(order),
        ).outstandingBalance);
      }
      if (COMPLETED_SERVICE_STATUSES.has(normalizedStatus(order.status)) || order.serviceProper?.completedAt || order.qcCompletedAt) {
        customer.completedServices += 1;
      }
      if (normalizedStatus(order.status) === 'cancelled') customer.cancelledBookings += 1;
      const visit = getVisitEvidenceAt(order);
      if (visit && (!customer.lastVisit || visit > new Date(customer.lastVisit))) customer.lastVisit = visit;
      const lines = getServiceLines(order);
      const vehicle = customer.vehicles.find((row) => {
        const orderPlate = String(order.vehicle?.plateNumber || order.vehiclePlate || '');
        return orderPlate && row.plate === orderPlate;
      });
      if (vehicle && visit) {
        vehicle.serviceHistory.push({
          bookingId: order.bookingReference || order.orderNumber || idOf(order),
          service: lines.map((line) => line.name).join(', '),
          date: visit,
          status: order.status,
        });
      }
    });

    customer.returning = customer.confirmedOrders > 1;
    const recentVisit = customer.lastVisit && isWithinRange(customer.lastVisit, activityRange.start, activityRange.end);
    const activeJourney = customer._orders.some((order) => isLegitimateBooking(order) && ACTIVE_JOURNEY_STATUSES.has(normalizedStatus(order.status)));
    customer.status = activeJourney || recentVisit ? 'active' : 'inactive';
    customer.periodActivity = customer.periodConfirmedOrders + (recentVisit ? 1 : 0);
    customer.vehicles.forEach((vehicle) => {
      delete vehicle._key;
      vehicle.serviceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    });
  });

  return [...registry.values()];
};

const publicCustomer = (customer) => {
  const { _orders, _payments, hasVerifiedPayment, ...publicRow } = customer;
  return publicRow;
};

export const loadCustomerRegistry = async (query = {}) => {
  const range = parseReportingRange({
    range: query.range || '90d',
    from: query.from,
    to: query.to,
  });
  const [users, vehicles, orders, payments] = await Promise.all([
    User.find({}),
    Vehicle.find({}),
    Order.find().populate('vehicle', 'year make model color plateNumber vehicleType'),
    Payment.find(),
  ]);
  let registry = buildCustomerRegistryFromRecords({ users, vehicles, orders, payments, activityRange: range });
  const summaryBase = registry;
  const totalVerifiedSpend = roundMoney(summaryBase.reduce((sum, row) => sum + row.totalSpent, 0));
  const spenders = summaryBase.filter((row) => row.totalSpent > 0).length;
  const summary = {
    totalCustomers: summaryBase.length,
    activeCustomers: summaryBase.filter((row) => row.status === 'active').length,
    returningCustomers: summaryBase.filter((row) => row.returning).length,
    verifiedCustomerSpend: totalVerifiedSpend,
    averageCustomerSpend: roundMoney(spenders ? totalVerifiedSpend / spenders : 0),
    spendingCustomers: spenders,
  };

  const status = String(query.status || 'all').toLowerCase();
  if (!['all', 'active', 'inactive'].includes(status)) {
    const error = new Error('status must be all, active, or inactive.');
    error.statusCode = 400;
    throw error;
  }
  if (status !== 'all') registry = registry.filter((row) => row.status === status);
  const search = String(query.search || '').trim().toLowerCase();
  if (search) {
    registry = registry.filter((row) => [row.name, row.email, row.phone, ...row.vehicles.flatMap((vehicle) => [vehicle.plate, vehicle.make, vehicle.model])]
      .some((value) => String(value || '').toLowerCase().includes(search)));
  }
  const sort = String(query.sort || 'lastVisit');
  const allowedSorts = new Set(['name', 'confirmedOrders', 'totalSpent', 'outstandingBalance', 'lastVisit', 'status', 'periodActivity']);
  if (!allowedSorts.has(sort)) {
    const error = new Error(`Unsupported customer sort: ${sort}`);
    error.statusCode = 400;
    throw error;
  }
  const direction = String(query.direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  registry.sort((a, b) => {
    if (sort === 'name' || sort === 'status') return direction * String(a[sort] || '').localeCompare(String(b[sort] || ''));
    if (sort === 'lastVisit') return direction * ((a.lastVisit ? new Date(a.lastVisit).getTime() : 0) - (b.lastVisit ? new Date(b.lastVisit).getTime() : 0));
    return direction * ((Number(a[sort]) || 0) - (Number(b[sort]) || 0));
  });
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const total = registry.length;
  const data = registry.slice((page - 1) * limit, page * limit).map(publicCustomer);
  return {
    range: { key: range.key, from: range.from, to: range.to, timeZone: REPORT_TIME_ZONE },
    summary,
    data,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    _registry: registry,
  };
};

export const loadCustomerDetail = async (customerKey, query = {}) => {
  // Financial fields are always lifetime-based inside the registry builder; the
  // 90-day range is used only for the customer's activity/status classification.
  const result = await loadCustomerRegistry({ range: '90d', limit: 100 });
  const customer = result._registry.find((row) => row.customerKey === customerKey);
  if (!customer) {
    const error = new Error('Customer record not found.');
    error.statusCode = 404;
    throw error;
  }
  return customer;
};

const paginate = (rows, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const total = rows.length;
  return { data: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
};

export const getCustomerOverview = async (customerKey) => publicCustomer(await loadCustomerDetail(customerKey));

export const getCustomerBookings = async (customerKey, query = {}) => {
  const customer = await loadCustomerDetail(customerKey);
  const paymentsByOrder = new Map();
  customer._payments.forEach((payment) => {
    const orderId = idOf(payment.order);
    if (!paymentsByOrder.has(orderId)) paymentsByOrder.set(orderId, []);
    paymentsByOrder.get(orderId).push(payment);
  });
  const rows = customer._orders.map((order) => {
    const total = getOrderServiceTotal(order);
    const ledger = summarizeLedgerRows(paymentsByOrder.get(idOf(order)) || [], total);
    return {
      id: idOf(order),
      bookingId: order.bookingReference || order.orderNumber || idOf(order),
      services: getServiceLines(order).map((line) => line.name),
      serviceTotal: total,
      appointmentDate: order.bookingDate || null,
      approvedAt: order.approvedAt || null,
      bookingStatus: order.status,
      amountPaid: ledger.netVerified,
      outstandingBalance: isLegitimateBooking(order) ? ledger.outstandingBalance : 0,
      lastVisit: getVisitEvidenceAt(order),
    };
  }).sort((a, b) => new Date(b.approvedAt || b.lastVisit || 0) - new Date(a.approvedAt || a.lastVisit || 0));
  return paginate(rows, query);
};

export const getCustomerTransactions = async (customerKey, query = {}) => {
  const customer = await loadCustomerDetail(customerKey);
  const orderMap = new Map(customer._orders.map((order) => [idOf(order), order]));
  const paymentsByOrder = new Map();
  customer._payments.forEach((payment) => {
    const orderId = idOf(payment.order);
    if (!paymentsByOrder.has(orderId)) paymentsByOrder.set(orderId, []);
    paymentsByOrder.get(orderId).push(payment);
  });
  const rows = customer._payments.map((payment) => buildLedgerTransaction(payment, {
    order: orderMap.get(idOf(payment.order)),
    orderPayments: paymentsByOrder.get(idOf(payment.order)) || [],
  })).sort((a, b) => new Date(b.effectiveAt || b.submittedAt || 0) - new Date(a.effectiveAt || a.submittedAt || 0));
  return paginate(rows, query);
};
