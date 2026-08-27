import {
  getCustomerBookings,
  getCustomerOverview,
  getCustomerTransactions,
  loadCustomerRegistry,
  loadSalesReport,
  loadSalesReportWithRows,
  salesReportToCsv,
} from '../services/salesAnalytics.service.js';

export const getSalesAnalyticsReport = async (req, res, next) => {
  try {
    const data = await loadSalesReport(req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const downloadSalesAnalyticsCsv = async (req, res, next) => {
  try {
    const report = await loadSalesReportWithRows(req.query || {});
    const csv = salesReportToCsv(report);
    const suffix = report.range.from && report.range.to
      ? `${report.range.from}_${report.range.to}`
      : 'all-time';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="autospf-sales-${suffix}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
};

export const getSalesCustomers = async (req, res, next) => {
  try {
    const result = await loadCustomerRegistry(req.query || {});
    const { _registry, ...data } = result;
    void _registry;
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

export const getSalesCustomerOverview = async (req, res, next) => {
  try {
    res.json({ success: true, data: await getCustomerOverview(req.params.customerKey) });
  } catch (error) {
    next(error);
  }
};

export const getSalesCustomerBookings = async (req, res, next) => {
  try {
    const result = await getCustomerBookings(req.params.customerKey, req.query || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const getSalesCustomerTransactions = async (req, res, next) => {
  try {
    const result = await getCustomerTransactions(req.params.customerKey, req.query || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

